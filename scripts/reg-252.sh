#!/bin/bash
cd /Users/davidpence/scc-work
for g in verify-v251-hud verify-v248-chips verify-v247-grade verify-v246-chrome; do
  SCC_URL=http://127.0.0.1:4177/scc/ node scripts/$g.cjs >/tmp/reg252-$g.log 2>&1
  echo "$g EXIT=$? $(grep -oE 'GATE-V[0-9]+ PASS[^ ]*|RESULT: PASS [0-9/]+' /tmp/reg252-$g.log | tail -1)"
done
