#!/bin/bash
# v2.49 live marker sweep
URL="https://wdavidpence.github.io/scc/"
ASSET=$(curl -s "$URL" | grep -o 'assets/index-[^"]*\.js' | head -1)
echo "ASSET=$ASSET"
B="/tmp/live-2490.js"
for i in 1 2 3; do
  curl -s "$URL$ASSET" -o "$B"
  SZ=$(stat -f%z "$B")
  if [ "$SZ" -gt 1000000 ]; then break; fi
  echo "retry $i (got ${SZ}B, SPA fallback)"; sleep 20
done
echo "SIZE=$(stat -f%z "$B")"
for M in chr-card-skarn chr-card-auraxis cur-terran ghostGrade _trailHead chr-card-terran; do
  printf "%s=%s\n" "$M" "$(grep -o "$M" "$B" | wc -l | tr -d ' ')"
done
