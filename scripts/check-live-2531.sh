#!/bin/bash
# v2.53.1 live verify: wait for bundle flip, marker sweep, live gates.
TARGET=index-nnS6XqJg.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2531.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
grep -c "objText" /tmp/live2531.js | sed 's/^/marker_objText_in_tipPos=/'
cd /Users/davidpence/scc-work
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v2531-tipcorner.cjs 2>&1 | tail -1
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v253-edgeclamp.cjs 2>&1 | tail -1
