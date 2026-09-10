#!/bin/bash
# v2.43 art campaign — 31 units x 3 candidates, Pollinations flux, fresh seeds, magenta-bg locked prompts.
# Prompts are REUSED verbatim from the v2.39 style bible (amplified by AMP suffix), never re-invented.
set -u
OUT=~/scc-work/ai_raw/campaign243
mkdir -p "$OUT"
SRC=~/scc-work/scripts/gen-ai-deep-v239.sh

# extract the original prompt components from the v239 bible
TT=$(grep '^TT=' "$SRC" | cut -d'"' -f2)
UNITSTYLE=$(grep '^UNITSTYLE=' "$SRC" | cut -d'"' -f2)
TERRAN=$(grep '^TERRAN=' "$SRC" | cut -d'"' -f2)
SKARN=$(grep '^SKARN=' "$SRC" | cut -d'"' -f2)
AURA=$(grep '^AURA=' "$SRC" | cut -d'"' -f2)
AMP=", ultra detailed crisp mechanical or organic parts, strong clear silhouette, high contrast rim light, vibrant saturated faction colors, AAA RTS sprite concept art, sharp focus"

TEAMOF() {
  case "$1" in
    rigger|marine|incinerator|tank|duster|ballista|wraith|battlecruiser|ghost|medic|drone|dropship) echo TERRAN;;
    skarling|skarnling|razorspine|vexwing|tremorclaw|skywarden|airstinger|burrower|sporecaster|corroder) echo SKARN;;
    *) echo AURA;;
  esac
}

# unit body descriptions extracted from the v239 bible (prompt between UNITSTYLE and faction var)
BODY() {
  grep "^gen u_$1 " "$SRC" | sed 's/^gen u_[a-z0-9]* *"\$UNITSTYLE, //' | sed 's/\$[A-Z].*$//'
}

gen() {
  local name="$1" prompt="$2" seed="$3"
  local enc
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")
  for attempt in 1 2 3; do
    local code
    code=$(curl -s -o "$OUT/$name.png" -w "%{http_code}" --max-time 180 \
      "https://image.pollinations.ai/prompt/$enc?width=512&height=512&seed=$seed&nologo=true&model=flux")
    local sz; sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$code" = "200" ] && [ "$sz" -gt 15000 ]; then echo "OK $name"; return 0; fi
    sleep 25
  done
  echo "FAIL $name"; rm -f "$OUT/$name.png"; return 1
}

for k in rigger marine incinerator tank duster ballista wraith battlecruiser ghost medic drone dropship skarling skarnling razorspine vexwing tremorclaw skywarden airstinger burrower artificer bladeguard sentinel stormcaller nightblade radiant ark voidlance umbral sporecaster corroder; do
  body=$(BODY "$k"); team=$(TEAMOF "$k")
  case "$team" in TERRAN) faction="$TERRAN";; SKARN) faction="$SKARN";; AURA) faction="$AURA";; esac
  for ci in 1 2 3; do
    seed=$((7000 + ci * 137 + ${#k} * 53))
    [ -f "$OUT/u_${k}_c${ci}.png" ] && continue
    gen "u_${k}_c${ci}" "$UNITSTYLE, $body$faction$TT$AMP" "$seed"
    sleep 15
  done
  echo "== $k done =="
done
echo CAMPAIGN_GEN_DONE
