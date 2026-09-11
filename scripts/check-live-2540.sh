#!/bin/bash
# v2.54.0 live verify: wait for bundle flip, marker sweep, live gate.
TARGET=index-BacCAGvK.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
for i in 1 2; do
  curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2540.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
  SZ=$(stat -f %z /tmp/live2540.js 2>/dev/null || echo 0)
  [ "$SZ" -gt 1000000 ] && break
  sleep 10
done
grep -c "_dustFxT" /tmp/live2540.js | sed 's/^/marker_dustFxT=/'
grep -c "_patrolPingAt" /tmp/live2540.js | sed 's/^/marker_patrolPingAt=/'
grep -c "__SCCBuilding" /tmp/live2540.js | sed 's/^/marker_sccbuilding=/'
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v254-patrol-dust.cjs 2>&1 | tail -7
