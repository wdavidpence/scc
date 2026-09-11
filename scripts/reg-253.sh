#!/bin/bash
cd /Users/davidpence/scc-work
for g in verify-v252-accent-ring verify-v251-hud verify-v248-chips verify-v247-grade verify-v246-chrome verify-v227-aaa verify-v219; do
  SCC_URL=http://127.0.0.1:4177/scc/ node scripts/$g.cjs >/tmp/reg253-$g.log 2>&1
  echo "$g EXIT=$? $(grep -oE 'GATE-V[0-9]+ PASS[^ ]*|RESULT: PASS [0-9/]+' /tmp/reg253-$g.log | tail -1)"
done
