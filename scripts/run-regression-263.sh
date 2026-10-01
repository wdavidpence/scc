#!/bin/bash
# full suite v247-v263 on current bundle
cd "$(dirname "$0")/.."
FAIL=0
# QA server preflight: browser gates are meaningless without it (2026-09-30:
# a whole suite run went RED on connection-refused while the code was fine)
CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "${SCC_URL:-http://127.0.0.1:4177/scc/}")
if [ "$CODE" != "200" ]; then echo "ABORT: QA server down at ${SCC_URL:-http://127.0.0.1:4177/scc/} (http $CODE) — start: node scripts/serve-dist.cjs"; exit 1; fi
# Phase-1 kernel gates (pure Node, no browser)
for g in verify-rng verify-fixed-tick verify-input-queue verify-sim-timers verify-order-golden verify-desync-report verify-replay-runner verify-worker-flow verify-input-purity verify-economy-golden verify-combat-golden verify-terrain-golden; do
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
# P1.027-i3b new-command live gate (patrol/place/deploy/merge/morph/queue/scan/ult/ucast + pause purge)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-cmd-live2.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "CMD-LIVE2 PASS 17/17"; then echo "OK   cmd-live2 :: $out"; else echo "FAIL cmd-live2 :: $out"; FAIL=1; fi
# P1.028 render teardown cannot fork a replay hash (twin battles, teardown @12-tick, projectile single-source)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-teardown-hash.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "TEARDOWN-HASH PASS"; then echo "OK   teardown-hash :: $out"; else echo "FAIL teardown-hash :: $out"; FAIL=1; fi
# P1.025-replay recorded cmd-stream replay identity (3 seeds, record/replay/truncate)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-replay-record.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "REPLAY-RECORD PASS"; then echo "OK   replay-record :: $out"; else echo "FAIL replay-record :: $out"; FAIL=1; fi
# P1.029 tick-split parity (browser, manual-clock harness — needs QA server)
# P1.036 per-tick hash ring (browser, manual-clock harness)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-hash-ring.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "HASH-RING PASS"; then echo "OK   hash-ring :: $out"; else echo "FAIL hash-ring :: $out"; FAIL=1; fi
# P1.029 tick-split parity (browser, manual-clock harness — needs QA server)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-tick-parity.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "PASS"; then echo "OK   tick-parity :: $out"; else echo "FAIL tick-parity :: $out"; FAIL=1; fi
# P1.033 render adapter: render-off + 144 Hz interpolation must be simulation-invisible (byte rings) and the moved tick-side writers must still fire
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-render-adapter.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "RENDER-ADAPTER PASS"; then echo "OK   render-adapter :: $out"; else echo "FAIL render-adapter :: $out"; FAIL=1; fi
# P1.034 net-side command queue: shuffled/duplicate/gapped arrival must reproduce canonical execution order + hash (kernel + live identity)
out=$(node scripts/verify-netcmds.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "NETQ PASS"; then echo "OK   netcmds :: $out"; else echo "FAIL netcmds :: $out"; FAIL=1; fi
# P1.035 replay format: SCCR/1 envelope must round-trip a 10-minute replay losslessly and refuse corruption/wrong-map/wrong-data
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-replay-format.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "REPLAY-FORMAT PASS"; then echo "OK   replay-format :: $out"; else echo "FAIL replay-format :: $out"; FAIL=1; fi
# P1.039 player-economy chain (browser, ~3 min: deploy + train + 100 s hands-off mining)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-economy-live.cjs 2>&1 | tail -3)
if echo "$out" | grep -q "ACCEPTANCE PASS"; then echo "OK   economy-live :: chain hands-off"; else echo "FAIL economy-live :: $out"; FAIL=1; fi
# DEF-MOVE-1 smooth-move gate (group travel quality, ~50 s: rally-pocket march must travel; footprint cluster must not freeze)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-smooth-move.cjs 2>&1 | tail -2)
if echo "$out" | grep -q "SMOOTH-MOVE PASS 2/2"; then echo "OK   smooth-move :: group travel + no freeze"; else echo "FAIL smooth-move :: $out"; FAIL=1; fi
# v2.69.2 building render gate (browser, ~40 s: no __MISSING, pseudo-3D tex, glow budget)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-build-visual.cjs 2>&1 | tail -3)
if echo "$out" | grep -q "BUILD-VISUAL PASS"; then echo "OK   build-visual :: bld render"; else echo "FAIL build-visual :: $out"; FAIL=1; fi
# v2.70 smokes: audio mixer (pause-panel + persistence) and R-replay debrief flow
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/smoke-audio-mixer.cjs 2>&1 | tail -1)
if echo "$out" | grep -q 'pageerrors: 0'; then echo "OK   audio-mixer :: pause panel"; else echo "FAIL audio-mixer :: $out"; FAIL=1; fi
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/smoke-replay.cjs 2>&1 | tail -1)
if echo "$out" | grep -q 'pageerrors: 0'; then echo "OK   replay-r :: debrief retry"; else echo "FAIL replay-r :: $out"; FAIL=1; fi
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/smoke-brief-skip.cjs 2>&1 | tail -1)
if echo "$out" | grep -q 'BRIEF-SKIP PASS'; then echo "OK   brief-skip :: replay briefing skip"; else echo "FAIL brief-skip :: $out"; FAIL=1; fi
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/smoke-custom.cjs 2>&1 | tail -2)
if echo "$out" | grep -q 'CUSTOM-MATCH PASS'; then echo "OK   custom-match :: C panel + stacked mods + boss"; else echo "FAIL custom-match :: $out"; FAIL=1; fi
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/smoke-voice-pack.cjs 2>&1 | tail -2)
if echo "$out" | grep -q 'non-200: NONE'; then echo "OK   voice-pack :: VO lanes"; else echo "FAIL voice-pack :: $out"; FAIL=1; fi
[ $FAIL -eq 0 ] && echo "SUITE GREEN" || echo "SUITE RED"
exit $FAIL
