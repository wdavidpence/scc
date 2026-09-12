#!/bin/bash
# v2.61 live marker sweep: elev paint, sky tint, denser weather
TARGET=${1:-auto}
for i in $(seq 1 30); do
  B=$(curl -s https://wdavidpence.github.io/scc/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  if [ "$TARGET" = "auto" ]; then TARGET=$B; fi
  if [ "$B" = "$TARGET" ]; then echo "BUNDLE_LIVE=$B"; break; fi
  echo "attempt $i live=$B waiting..."; sleep 20
done
for i in 1 2; do
  curl -s "https://wdavidpence.github.io/scc/assets/$TARGET" -o /tmp/live2610.js -w "ASSET_FETCH=%{http_code} %{size_download}\n"
  SZ=$(stat -f %z /tmp/live2610.js 2>/dev/null || echo 0)
  [ "$SZ" -gt 1000000 ] && break
  sleep 10
done
grep -c "2969976" /tmp/live2610.js | sed 's/^/marker_skytint_horizon=/'
grep -c "12176358" /tmp/live2610.js | sed 's/^/marker_elev_face=/'
grep -c "2304824" /tmp/live2610.js | sed 's/^/marker_rock_paint=/'
grep -oE "=[0-9.]+Math\.random\(\)\*0\.07" /tmp/live2610.js | head -1 | sed 's/^/marker_weather_cadence=/'
SCC_URL=https://wdavidpence.github.io/scc/ node scripts/verify-v261-mm-sky-dust.cjs 2>&1 | tail -6
