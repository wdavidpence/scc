#!/bin/bash
# v2.53 live verify: wait for bundle flip, marker sweep, live gate, edge screenshots.
TARGET=index-BdcCk7eK.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live253.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
for m in "clampCam" "_logW" "MSGLOG\|_logText"; do
  c=$(grep -c "${m%%\\*}" /tmp/live253.js 2>/dev/null || echo 0)
done
grep -c "clampCam" /tmp/live253.js | sed 's/^/marker_clampCam=/'
grep -c "_logW" /tmp/live253.js | sed 's/^/marker_logW=/'
cd /Users/davidpence/scc-work
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v253-edgeclamp.cjs 2>&1 | tail -2
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v252-accent-ring.cjs 2>&1 | tail -1
