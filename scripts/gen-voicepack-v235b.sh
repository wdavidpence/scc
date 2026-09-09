#!/usr/bin/env bash
# v2.35b — Terran announcer + unit voice completion (edge-tts, free). Skips existing.
set -uo pipefail
cd "$(dirname "$0")/.."
PY=/Users/davidpence/.hermes/hermes-agent/venv/bin/edge-tts
gen() { local voice="$1" rate="$2" pitch="$3" out="$4"; shift 4
  if [ -s "$out" ]; then echo "SKIP $out"; return 0; fi
  mkdir -p "$(dirname "$out")"
  $PY --voice "$voice" --rate="$rate" --pitch="$pitch" --text "$*" --write-media "$out" 2>/dev/null && echo "OK $out ($(stat -f%z "$out")b)" || { rm -f "$out"; echo "FAIL $out"; }
}
T=public/vo/terran
# announced errors — dry NRP command voice (distinct from unit voices)
gen en-GB-RyanNeural -4% +0Hz "$T/err_supply_1.m4a" "Supply lines are dry. More depots required."
gen en-GB-RyanNeural -4% +0Hz "$T/err_supply_2.m4a" "Cannot deploy. Additional supply needed."
gen en-GB-RyanNeural -4% +0Hz "$T/err_tech_1.m4a" "Technology locked. Research prerequisites first."
gen en-GB-RyanNeural -4% +0Hz "$T/err_tech_2.m4a" "Denied. That tech is not in our library."
gen en-GB-RyanNeural -4% +0Hz "$T/err_place_1.m4a" "Invalid position. Clear the ground."
gen en-GB-RyanNeural -4% +0Hz "$T/err_place_2.m4a" "Can't build there. Blocked."
gen en-GB-RyanNeural -4% +0Hz "$T/err_energy_1.m4a" "Insufficient energy reserves."
gen en-GB-RyanNeural -4% +0Hz "$T/err_energy_2.m4a" "Not enough power. Recharge and retry."
gen en-GB-RyanNeural -4% +0Hz "$T/err_nocrew_1.m4a" "No operators available."
gen en-GB-RyanNeural -4% +0Hz "$T/err_nocrew_2.m4a" "All crews are committed."
gen en-US-GuyNeural +8% +0Hz "$T/underattack_1.m4a" "We're under attack!"
gen en-US-GuyNeural +8% +0Hz "$T/underattack_2.m4a" "Taking fire! Respond!"
gen en-US-GuyNeural +10% +0Hz "$T/select2_1.m4a" "Yeah, I heard you the first time."
gen en-US-GuyNeural +10% +0Hz "$T/select2_2.m4a" "What is it now?"
gen en-US-JennyNeural +14% +0Hz "$T/select3_1.m4a" "Quit poking me, commander!"
gen en-US-JennyNeural +14% +0Hz "$T/select3_2.m4a" "I'm armed, I'm ready, back off!"
echo DONE
