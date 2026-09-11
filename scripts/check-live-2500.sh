#!/bin/bash
# v2.50 live marker sweep
URL="https://wdavidpence.github.io/scc/"
ASSET=$(curl -s "$URL" | grep -o 'assets/index-[^"]*\.js' | head -1)
echo "ASSET=$ASSET"
B="/tmp/live-2500.js"
for i in 1 2 3; do
  curl -s "$URL$ASSET" -o "$B"
  SZ=$(stat -f%z "$B")
  if [ "$SZ" -gt 1000000 ]; then break; fi
  echo "retry $i (got ${SZ}B, SPA fallback)"; sleep 20
done
echo "SIZE=$(stat -f%z "$B")"
for M in drawMmBrackets mmBrackets mmAcc buildCompleteFX rallyPoint; do
  printf "%s=%s\n" "$M" "$(grep -o "$M" "$B" | wc -l | tr -d ' ')"
done
git -C /Users/davidpence/scc-work ls-remote --tags origin | grep v2.50 || echo "TAG v2.50.0 MISSING"
