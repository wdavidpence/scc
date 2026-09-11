#!/bin/bash
# Poll until live bundle = index-Cz_jVeQN.js, then marker sweep.
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "index-Cz_jVeQN.js" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
A=$(curl -s "https://wdavidpence.github.io/scc/assets/$B" -o /tmp/live252.js -w "%{http_code} %{size_download}")
echo "ASSET_FETCH=$A"
for m in "_hoverPips" "_hoverAcc" "raceAcc" "hoverGlow"; do
  c=$(grep -c "$m" /tmp/live252.js)
  echo "marker $m=$c"
done
