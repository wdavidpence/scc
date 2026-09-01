#!/bin/bash
cd /Users/davidpence/scc-work
for m in spiderMine updateInterceptors updatePatrol harvestGas cloaked updateSiege patrolPoints waypoints psiStorm; do
  b=$(grep -c "$m" dist/assets/index-DPY2TNsb.js)
  s=$(grep -rc "$m" src2/engine/entity.js src2/scenes/BattleScene.js src2/data/sc1.js src2/scenes/HudScene.js | awk -F: '{t+=$2} END{print t}')
  echo "$m bundle=$b src=$s"
done
