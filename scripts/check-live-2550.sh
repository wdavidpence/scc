#!/bin/bash
# v2.55.0 live verify: wait for bundle flip, marker sweep, live gate.
TARGET=index-B5xljiej.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
for i in 1 2; do
  curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2550.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
  SZ=$(stat -f %z /tmp/live2550.js 2>/dev/null || echo 0)
  [ "$SZ" -gt 1000000 ] && break
  sleep 10
done
grep -c "_rallyFlagPoint" /tmp/live2550.js | sed 's/^/marker_rallyFlagPoint=/'
grep -c "queueChipRow" /tmp/live2550.js | sed 's/^/marker_queueChipRow=/'
grep -c "0xff5c5c" /tmp/live2550.js | sed 's/^/marker_hottrail_hex=/'
grep -c "16698556" /tmp/live2550.js | sed 's/^/marker_hottrail_dec=/'
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v255-rally-queue-trail.cjs 2>&1 | tail -7
