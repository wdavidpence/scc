#!/usr/bin/env bash
# v2.31 — regenerate race VO packs (edge-tts, free) with IP-safe lines.
set -uo pipefail
cd "$(dirname "$0")/.."
PY=/Users/davidpence/.hermes/hermes-agent/venv/bin/edge-tts
gen() { local voice="$1" rate="$2" pitch="$3" out="$4"; shift 4
  $PY --voice "$voice" --rate="$rate" --pitch="$pitch" --text "$*" --write-media "$out" 2>/dev/null && echo "OK $out" || echo "FAIL $out"; }

S=public/vo/skarn; mkdir -p "$S"
gen en-US-GuyNeural -15% -30Hz "$S/move_1.m4a" "We move."
gen en-US-GuyNeural -15% -30Hz "$S/move_2.m4a" "Hunting."
gen en-US-GuyNeural -15% -30Hz "$S/move_3.m4a" "Obey."
gen en-US-GuyNeural -10% -35Hz "$S/attack_1.m4a" "Kill them all."
gen en-US-GuyNeural -10% -35Hz "$S/attack_2.m4a" "Slay!"
gen en-US-GuyNeural -10% -35Hz "$S/attack_3.m4a" "For the swarm."
gen en-US-GuyNeural -12% -30Hz "$S/ready_1.m4a" "Yes master."
gen en-US-GuyNeural -12% -30Hz "$S/ready_2.m4a" "Hatching."
gen en-US-GuyNeural -12% -30Hz "$S/select_1.m4a" "The swarm hears."
gen en-US-GuyNeural -12% -30Hz "$S/build_1.m4a" "The blight spreads."

A=public/vo/auraxis; mkdir -p "$A"
gen en-GB-SoniaNeural -5% +8Hz "$A/move_1.m4a" "It is done."
gen en-GB-SoniaNeural -5% +8Hz "$A/move_2.m4a" "Advancing."
gen en-GB-SoniaNeural -5% +8Hz "$A/move_3.m4a" "The light ascends."
gen en-GB-SoniaNeural +0% +10Hz "$A/attack_1.m4a" "Purge the enemy."
gen en-GB-SoniaNeural +0% +10Hz "$A/attack_2.m4a" "For the Auraxis."
gen en-GB-SoniaNeural +0% +10Hz "$A/attack_3.m4a" "My light endures."
gen en-GB-SoniaNeural +0% +10Hz "$A/boss_1.m4a" "Your end is written in light."
gen en-GB-SoniaNeural +0% +10Hz "$A/boss_2.m4a" "Kneel before the Convocation."
gen en-GB-SoniaNeural +0% +10Hz "$A/boss_3.m4a" "The storm answers."
gen en-GB-SoniaNeural -5% +8Hz "$A/build_1.m4a" "The construct rises."
gen en-GB-SoniaNeural -5% +8Hz "$A/ready_1.m4a" "Ready."
gen en-GB-SoniaNeural -5% +8Hz "$A/ready_2.m4a" "Orders."
gen en-GB-SoniaNeural -5% +8Hz "$A/select_1.m4a" "Speak."

I=public/vo/intro
gen en-US-DavisNeural -8% +0Hz "$I/control1.mp3" "Outwatch Relay Log, entry one four four. Relay Station Kesh has gone dark. All forty two thousand souls."

# update manifest
python3 - <<'EOF'
import json
m={"terran":{"trained":1,"ready":3,"select":2,"build":2,"move":4,"attack":4},
"skarn":{"ready":2,"select":1,"build":1,"move":3,"attack":3},
"auraxis":{"ready":2,"boss":3,"select":1,"build":1,"move":3,"attack":3}}
json.dump(m,open('public/vo/manifest.json','w'),indent=1)
print("manifest written")
EOF
ls public/vo/skarn | wc -l; ls public/vo/auraxis | wc -l
