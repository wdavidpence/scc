#!/bin/bash
TARGET=index-CefqYqwD.js
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
for i in 1 2; do
  curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2560.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
  SZ=$(stat -f %z /tmp/live2560.js 2>/dev/null || echo 0)
  [ "$SZ" -gt 1000000 ] && break
  sleep 10
done
grep -c "weatherFX" /tmp/live2560.js | sed 's/^/marker_weatherFX=/'
grep -c "buildingBark" /tmp/live2560.js | sed 's/^/marker_buildingBark=/'
grep -c "1180" /tmp/live2560.js | sed 's/^/marker_sonar_freq=/'
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v256-radar-voice-weather.cjs 2>&1 | tail -7
