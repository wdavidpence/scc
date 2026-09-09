#!/bin/bash
# Live-verify v2.34.1 deploy: fetch live page + bundle, grep bare literals that survive minification.
set -e
cd /tmp
HASH=$(curl -s https://wdavidpence.github.io/scc/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
echo "live asset: $HASH"
curl -s "https://wdavidpence.github.io/scc/$HASH" > live234.js
ls -la live234.js
for m in lastSeenIntel currentlyVisible 76839a seenCells attackTarget; do
  printf '%s: %s\n' "$m" "$(grep -o "$m" live234.js | wc -l | tr -d ' ')"
done
echo "ip_sweep: $(grep -io 'zerg\|protoss' live234.js | wc -l | tr -d ' ')"
