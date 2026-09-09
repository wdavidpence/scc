#!/usr/bin/env bash
# v2.35 live verify: bare-literal marker sweep of the live bundle + VO asset check
cd ~/scc-work
curl -s https://wdavidpence.github.io/scc/assets/index-ChWmyzuP.js -o /tmp/live235.js
for m in "Quit poking me" "The brood starves" "Geometry rejects" "b10b" "underattack" "idleChatter" "err_supply"; do
  printf '%s: %s\n' "$m" "$(grep -o "$m" /tmp/live235.js | wc -l | tr -d ' ')"
done
printf 'IP_hits: %s\n' "$(grep -io 'zerg' /tmp/live235.js | wc -l | tr -d ' ')"
printf 'protoss_hits: %s\n' "$(grep -io 'protoss' /tmp/live235.js | wc -l | tr -d ' ')"
printf 'brief_b1a: %s %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{size_download}' https://wdavidpence.github.io/scc/vo/brief/b1a.mp3)"
printf 'terr_err_supply_1: %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{size_download}' https://wdavidpence.github.io/scc/vo/terran/err_supply_1.m4a)"
printf 'skarn_select3_2: %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{size_download}' https://wdavidpence.github.io/scc/vo/skarn/select3_2.m4a)"
