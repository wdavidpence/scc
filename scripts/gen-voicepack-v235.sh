#!/usr/bin/env bash
# v2.35 Sprint A voice pack: per-race ANNOUNCER error library, under-attack
# warnings, escalating repeat-select tiers, and voiced mission briefings.
# edge-tts (free). Re-runnable; skips clips that already exist non-empty.
set -uo pipefail
cd "$(dirname "$0")/.."
PY=/Users/davidpence/.hermes/hermes-agent/venv/bin/edge-tts

gen() { # voice rate pitch out text
  local voice="$1" rate="$2" pitch="$3" out="$4"; shift 4
  if [ -s "$out" ]; then echo "SKIP $out"; return 0; fi
  mkdir -p "$(dirname "$out")"
  $PY --voice "$voice" --rate="$rate" --pitch="$pitch" --text "$*" --write-media "$out" 2>/dev/null && echo "OK $out ($(stat -f%z "$out")b)" || { rm -f "$out"; echo "FAIL $out"; }
}

# ---------- TERRANN announcer (crisp command voice) ----------
T=public/vo/terran
V=en-US-ChristopherNeural
gen $V -4% -2Hz "$T/err_supply_1.m4a" "Supply lines are dry. More depots required."
gen $V -4% -2Hz "$T/err_supply_2.m4a" "Cannot deploy. Additional supply needed."
gen $V -4% -2Hz "$T/err_tech_1.m4a" "Technology locked. Research prerequisites first."
gen $V -4% -2Hz "$T/err_tech_2.m4a" "Denied. That tech is not in our library."
gen $V -4% -2Hz "$T/err_place_1.m4a" "Invalid position. Clear the ground."
gen $V -4% -2Hz "$T/err_place_2.m4a" "Can't build there. Blocked."
gen $V -4% -2Hz "$T/err_energy_1.m4a" "Insufficient energy reserves."
gen $V -4% -2Hz "$T/err_energy_2.m4a" "Not enough power. Recharge and retry."
gen $V -4% -2Hz "$T/err_nocrew_1.m4a" "No operators available."
gen $V -4% -2Hz "$T/err_nocrew_2.m4a" "All crews are committed."
gen $V +6% +1Hz "$T/underattack_1.m4a" "We're under attack!"
gen $V +6% +1Hz "$T/underattack_2.m4a" "Taking fire! Respond!"
gen $V +8% +0Hz "$T/select2_1.m4a" "Yeah, I heard you the first time."
gen $V +8% +0Hz "$T/select2_2.m4a" "What is it now?"
gen $V +12% -1Hz "$T/select3_1.m4a" "Quit poking me, commander!"
gen $V +12% -1Hz "$T/select3_2.m4a" "I'm armed, I'm ready, back OFF!"

# ---------- SKARN announcer (guttural hive voice) ----------
S=public/vo/skarn
V=en-US-GuyNeural
gen $V -14% -38Hz "$S/err_supply_1.m4a" "The brood starves. Feed it, or break."
gen $V -14% -38Hz "$S/err_supply_2.m4a" "No husk left to hatch. More nests."
gen $V -14% -38Hz "$S/err_tech_1.m4a" "The gene-vault is sealed. Evolve first."
gen $V -14% -38Hz "$S/err_tech_2.m4a" "Form not learned. The crown refuses."
gen $V -14% -38Hz "$S/err_place_1.m4a" "Ground is wrong. Chitin will not take."
gen $V -14% -38Hz "$S/err_place_2.m4a" "Blocked. The blight recedes."
gen $V -14% -38Hz "$S/err_energy_1.m4a" "Bile reserves empty."
gen $V -14% -38Hz "$S/err_energy_2.m4a" "No venom to spend."
gen $V -14% -38Hz "$S/err_nocrew_1.m4a" "No drones remain unspent."
gen $V -14% -38Hz "$S/err_nocrew_2.m4a" "All claws are busy tearing."
gen $V -8% -42Hz "$S/underattack_1.m4a" "We are struck! Blood flows!"
gen $V -8% -42Hz "$S/underattack_2.m4a" "Pain! Give them MORE pain!"
gen $V -8% -40Hz "$S/select2_1.m4a" "Prodding the swarm is unwise."
gen $V -8% -40Hz "$S/select2_2.m4a" "We hear. We bite. Wait."
gen $V -4% -44Hz "$S/select3_1.m4a" "Click again and you lose a finger."
gen $V -4% -44Hz "$S/select3_2.m4a" "The hive froths. Cease!"

# ---------- AURAXIS announcer (resonant conclave voice) ----------
A=public/vo/auraxis
V=en-GB-SoniaNeural
gen $V -6% +10Hz "$A/err_supply_1.m4a" "The conduit lacks capacity. Raise more pylons."
gen $V -6% +10Hz "$A/err_supply_2.m4a" "Harmony broken. Supply is insufficient."
gen $V -6% +10Hz "$A/err_tech_1.m4a" "That knowledge is forbidden until the litany completes."
gen $V -6% +10Hz "$A/err_tech_2.m4a" "The archive is sealed. Study first."
gen $V -6% +10Hz "$A/err_place_1.m4a" "Geometry rejects this ground."
gen $V -6% +10Hz "$A/err_place_2.m4a" "Unworthy position. Move the construct."
gen $V -6% +10Hz "$A/err_energy_1.m4a" "The light within is spent."
gen $V -6% +10Hz "$A/err_energy_2.m4a" "Insufficient psionic charge."
gen $V -6% +10Hz "$A/err_nocrew_1.m4a" "No artificers stand idle."
gen $V -6% +10Hz "$A/err_nocrew_2.m4a" "All hands are woven elsewhere."
gen $V +4% +12Hz "$A/underattack_1.m4a" "We are assailed! Shields!"
gen $V +4% +12Hz "$A/underattack_2.m4a" "Fire upon our light! Answer them!"
gen $V +6% +10Hz "$A/select2_1.m4a" "We acknowledged you once."
gen $V +6% +10Hz "$A/select2_2.m4a" "Patience is also a weapon."
gen $V +8% +8Hz "$A/select3_1.m4a" "Repeat the summons and face judgement."
gen $V +8% +8Hz "$A/select3_2.m4a" "You test devotion, commander."

# ---------- mission briefings (voiced radio dialogue) ----------
I=public/vo/brief
VOSS=en-US-ChristopherNeural; HAL=en-US-GuyNeural; KATE=en-US-AriaNeural
OVER=en-US-GuyNeural; CONCLAVE=en-GB-SoniaNeural; FENIX=en-US-ChristopherNeural
gen $VOSS -4% -2Hz "$I/m1a.mp3" "Magistrate, the colony is a graveyard and the local fauna made it that way. You will re-establish the mineral line and purge the sector."
gen $HAL -8% -6Hz "$I/m1b.mp3" "Translation: clean up the mess someone else made. Boot your marines, build a depot, and stay off the blight until you have guns."
gen $VOSS -4% -2Hz "$I/m2a.mp3" "A coordinated swarm has landed on our flank. This is not the scattered vermin you scrubbed last tour."
gen $KATE -4% +2Hz "$I/m2b.mp3" "They are walling off the gas geyser before we can. If they lock the gas, they lock the tech. Break their grip early."
gen $VOSS -4% -2Hz "$I/m3a.mp3" "A renegade warlord claims this sector by right of salvage. He has our old battlecruiser parts, and no scruples."
gen $HAL -8% -6Hz "$I/m3b.mp3" "Terran on terran. Fine by me. Just watch for the incinerators. They like the terrain a little too much."
gen $CONCLAVE -8% +12Hz "$I/m4a.mp3" "Adept heralds rise in the high orbit. Their shields drink fire and their storm answers in kind."
gen $KATE -4% +2Hz "$I/m4b.mp3" "Do not bunch up. Their storm punishes tight formations. Spread out, swarm their shields, break the projectors."
gen $OVER -18% -40Hz "$I/m5a.mp3" "The brood nest screams your name across every dead channel. It does not negotiate. It consumes."
gen $HAL -8% -6Hz "$I/m5b.mp3" "Four minutes of hell, then the tunnel mouths empty. Bunkers up, marines loaded, and keep the drop lanes clear."
gen $VOSS -4% -2Hz "$I/m6a.mp3" "The warlord's fortress bristles with turrets and a champion battlecruiser owns the sky above it."
gen $VOSS -4% +0Hz "$I/m6b.mp3" "Bring siege tanks and bring them early. We crack the wall, then we own the rubble."
gen $CONCLAVE -8% +12Hz "$I/m7a.mp3" "The Fleet of the Executor darkens your sun. Its arks judge you unworthy of orbit."
gen $FENIX -4% +4Hz "$I/m7b.mp3" "Interceptors are children until the hangar sings. Shoot the singers. The sky falls after."
gen $OVER -18% -40Hz "$I/m8a.mp3" "The Mind focuses its ten thousand eyes upon your hives of metal and your small green world. It is curious how you will die."
gen $HAL -8% -6Hz "$I/m8b.mp3" "Three minutes of everything it has. Then we put rounds down the throat of that Tremorclaw and end the argument."
gen $VOSS -4% -2Hz "$I/m9a.mp3" "Ghost operatives hit our supply lines at three installations last night. No bodies. No trace. No survivors."
gen $KATE -4% +2Hz "$I/m9b.mp3" "Keep detection coverage on every convoy lane and stagger the moves. You can't shoot what you can't see."
gen $OVER -18% -40Hz "$I/m10a.mp3" "You have taken broods from me. You have salted my blight. Tonight the debt comes due in fang and acid."
gen $HAL -8% -6Hz "$I/m10b.mp3" "Last ride, folks. Everything we've got, straight down the middle. Nobody gets left behind."

# ---------- merge manifest (keep existing keys, add new counts) ----------
python3 - <<'PYEOF'
import json
m = json.load(open('public/vo/manifest.json'))
for race, adds in {
  'terran':  {'err_supply':2,'err_tech':2,'err_place':2,'err_energy':2,'err_nocrew':2,'underattack':2,'select2':2,'select3':2},
  'skarn':   {'err_supply':2,'err_tech':2,'err_place':2,'err_energy':2,'err_nocrew':2,'underattack':2,'select2':2,'select3':2},
  'auraxis': {'err_supply':2,'err_tech':2,'err_place':2,'err_energy':2,'err_nocrew':2,'underattack':2,'select2':2,'select3':2},
}.items():
    m.setdefault(race, {}).update(adds)
json.dump(m, open('public/vo/manifest.json','w'), indent=1)
print('manifest merged:', {k: len(v) for k,v in m.items()})
PYEOF
echo "--- sizes check (0-byte = FAIL) ---"
find public/vo/terran public/vo/skarn public/vo/auraxis -newer scripts/gen-voicepack.sh -name '*.m4a' -size -3k | head
find public/vo/brief -size -3k 2>/dev/null | head
echo DONE
