#!/bin/bash
TARGET=index-CwX_GoKp.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
for i in 1 2; do
  curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2570.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
  SZ=$(stat -f %z /tmp/live2570.js 2>/dev/null || echo 0)
  [ "$SZ" -gt 1000000 ] && break
  sleep 10
done
grep -c "techCelebrate" /tmp/live2570.js | sed 's/^/marker_techCelebrate=/'
grep -c "_techFx" /tmp/live2570.js | sed 's/^/marker_techFx=/'
grep -c "victorySpark" /tmp/live2570.js | sed 's/^/marker_victorySpark=/'
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v257-fx3.cjs 2>&1 | tail -7
