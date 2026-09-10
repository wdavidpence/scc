#!/bin/bash
# v2.45 building art campaign — 37 structures x3 candidates, Pollinations flux, fresh seeds.
# Prompts REUSED verbatim from the v2.39 style bible (AMP suffix amplified), never re-invented.
set -u
OUT=~/scc-work/ai_raw/campaign245b
mkdir -p "$OUT"
SRC=~/scc-work/scripts/gen-ai-deep-v239.sh

TT=$(grep '^TT=' "$SRC" | cut -d'"' -f2)
B_TERRAN=$(grep '^B_TERRAN=' "$SRC" | cut -d'"' -f2 | sed 's/\$TT$//')
B_SKARN=$(grep '^B_SKARN=' "$SRC" | cut -d'"' -f2 | sed 's/\$TT$//')
B_AURA=$(grep '^B_AURA=' "$SRC" | cut -d'"' -f2 | sed 's/\$TT$//')
TT="${TT} "
AMP=", ultra detailed crisp architecture, strong clear silhouette, high contrast rim light, vibrant saturated faction colors, AAA RTS building concept art, sharp focus"

gen() {
  local name="$1" prompt="$2" w="$3" h="$4" seed="$5"
  for attempt in 1 2 3; do
    [ -s "$OUT/$name.png" ] && return 0
    curl -s --max-time 120 "https://image.pollinations.ai/prompt/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")?width=$w&height=$h&seed=$seed&nologo=true" -o "$OUT/$name.png"
    sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$sz" -gt 8000 ]; then echo "OK $name ($sz)"; return 0; fi
    echo "retry $attempt $name ($sz)"; sleep 8
  done
  echo "FAIL $name"
}

BS() {
  grep "^gen s_$1 " "$SRC" | sed 's/^gen s_[a-zA-Z0-9_]* *"//' | sed 's/ *\$B_[A-Z]*".*$//'
}
FACTIONOF() {
  grep "^gen s_$1 " "$SRC" | grep -o '\$B_[A-Z]*' | tr -d '$'
}

I=0
for k in commandCenter supplyDepot refinery barracks factory machineShop starport controlTower academy missileTurret engineeringBay scienceFacility bunker broodNest geneForge blightNode clawPit spineWarren aerie hive deepWarren tremorCavern stingerColony gasSiphon aegis essenceTap conduit portal fabricator synapseCore runeworks psiVault convocation skyPortal skyAnchor lanceTurret forge; do
  body=$(BS "$k")
  facvar=$(FACTIONOF "$k")
  fac=$(eval echo "\$$facvar")
  # strip trailing $TT from faction var (it was expanded already) then re-append AMP+TT
  I=$((I+1))
  for ci in 1 2 3; do
    seed=$((4400 + I * 31 + ci * 7))
    fname="b_${k}_c${ci}"
    gen "$fname" "$body $fac$AMP$TT" 768 512 "$seed"
    sleep 15
  done
done
echo BUILDINGCAMPDONE
