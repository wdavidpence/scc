#!/bin/bash
# v2.39 deep AI art pass — ALL units (31) + ALL structures (39) + effects.
# Pollinations Flux free tier. ORIGINAL-IP prompts only (invented factions: Terran Dominion / Skarn / Auraxis).
set -u
OUT=~/scc-work/ai_raw
mkdir -p "$OUT"
gen() {
  local name="$1" prompt="$2" w="$3" h="$4" seed="$5"
  # skip if already generated
  if [ -f "$OUT/$name.png" ] && [ "$(stat -f%z "$OUT/$name.png")" -gt 15000 ]; then echo "SKIP $name"; return 0; fi
  local enc
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")
  for attempt in 1 2 3; do
    curl -s -o "$OUT/$name.png" -w "%{http_code}" --max-time 180 \
      "https://image.pollinations.ai/prompt/$enc?width=$w&height=$h&seed=$seed&nologo=true&model=flux" > "$OUT/.code_$name"
    code=$(cat "$OUT/.code_$name")
    sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$code" = "200" ] && [ "$sz" -gt 15000 ]; then echo "OK $name"; return 0; fi
    sleep 20
  done
  echo "FAIL $name"
}

TT=", centered alone, flat solid pure magenta background #FF00FF, no shadow on background, no ground plane, rim lighting, single object, no text, no logos, no watermark, original IP"
UNITSTYLE="game unit sprite, RTS top-down slightly elevated three-quarter view, facing right, painterly AAA sci-fi"
TERRAN=" faction palette: gunmetal grey steel armor plating, industrial riveted panels, glowing cyan trim lights, slight battle scuffs"
SKARN=" faction palette: organic chitinous brown-black carapace, acid-green glowing veins, wet organic texture, menacing"
AURA=" faction palette: sleek platinum-white armour, floating golden energy rings and azure hard-light accents, elegant angular futuristic"

# ---------------- UNITS (facing right) ----------------
gen u_rigger    "$UNITSTYLE, small robotic worker drone with articulated mechanical arms and welding torch, compact wheels$TERRAN$TT" 512 512 901
gen u_marine    "$UNITSTYLE, infantry soldier in bulky powered exo-armor helmet with orange visor, holding pulse rifle$TERRAN$TT" 512 512 902
gen u_incinerator "$UNITSTYLE, infantry soldier in flameproof heavy suit carrying twin flamethrower nozzles with pilot flame$TERRAN$TT" 512 512 903
gen u_tank      "$UNITSTYLE, heavy treaded siege tank with long rotating cannon barrel and shells ejected port$TERRAN$TT" 768 512 904
gen u_duster    "$UNITSTYLE, fast wheeled scout buggy with big radial tires, radar dish and mounted machine gun$TERRAN$TT" 512 512 905
gen u_ballista  "$UNITSTYLE, colossal four-legged walker siege cannon with twin barrel batteries, hydraulic legs$TERRAN$TT" 768 512 906
gen u_wraith    "$UNITSTYLE, angular stealth strike fighter jet with bent wings and engine afterburner glow$TERRAN$TT" 768 512 907
gen u_battlecruiser "$UNITSTYLE, enormous capital battleship seen from above, layered gunmetal decks, huge engines, missile pods$TERRAN$TT" 768 512 908
gen u_ghost     "$UNITSTYLE, elite stealth infantry sniper in dark tactical suit with long sniper rifle, half-cloaked shimmer$TERRAN$TT" 512 512 909
gen u_medic     "$UNITSTYLE, combat medic infantry in white-grey armor with glowing blue medical kit and cross emblem$TERRAN$TT" 512 512 910
gen u_drone     "$UNITSTYLE, small quadruped mechanical harvesting drone with collection claw, hovering rotors$TERRAN$TT" 512 512 911
gen u_dropship  "$UNITSTYLE, bulky armored troop transport gunship with side doors, twin rotors, ramp$TERRAN$TT" 768 512 912
gen u_skarling  "$UNITSTYLE, small fast insectoid crawler creature, six legs, snapping jaw head$SKARN$TT" 512 512 913
gen u_skarnling "$UNITSTYLE, armored melee insectoid crawler with spiked shoulder shells and scythe claws$SKARN$TT" 512 512 914
gen u_razorspine "$UNITSTYLE, quadruped beast with rows of razor spines along arched back, low slung body$SKARN$TT" 768 512 915
gen u_vexwing   "$UNITSTYLE, flying stinger creature, insectile membranous wings, barbed stinger tail$SKARN$TT" 512 512 916
gen u_tremorclaw "$UNITSTYLE, colossal armored burrowing beast with massive crushing claws and plated back ridges$SKARN$TT" 768 512 917
gen u_skywarden "$UNITSTYLE, huge flying manta-like leviathan creature, wide membrane wings, glowing underbelly sacs$SKARN$TT" 768 512 918
gen u_airstinger "$UNITSTYLE, small fast flying insect stinger swarm fighter, darting body, twin wings$SKARN$TT" 512 512 919
gen u_burrower  "$UNITSTYLE, gargantuan subterranean worm transport creature erupting from ground, segmented armored body$SKARN$TT" 768 512 920
gen u_artificer "$UNITSTYLE, hovering robotic construction drone, floating chassis with golden energy tool arms$AURA$TT" 512 512 921
gen u_bladeguard "$UNITSTYLE, humanoid sword warrior in sleek white-gold angular armor, floating energy blade$AURA$TT" 512 512 922
gen u_sentinel  "$UNITSTYLE, towering robotic guardian with single glowing azure optic, platinum shoulder pauldrons, energy spear$AURA$TT" 768 512 923
gen u_stormcaller "$UNITSTYLE, hovering arcane caster robot, robe-like metal plates, channeling lightning between raised hands$AURA$TT" 512 512 924
gen u_nightblade "$UNITSTYLE, agile assassin robot in dark violet-black plating, twin energy daggers, glowing slit optic$AURA$TT" 512 512 925
gen u_radiant   "$UNITSTYLE, radiant seraph robot, luminous gold core chest, six small floating light drones orbiting head$AURA$TT" 512 512 926
gen u_ark       "$UNITSTYLE, enormous floating cathedral fortress ship, platinum spires, golden rings, radiant beam emitters$AURA$TT" 768 512 927
gen u_voidlance "$UNITSTYLE, sleek flying lance warship, long needle hull with azure energy lance extending from prow$AURA$TT" 768 512 928
gen u_umbral    "$UNITSTYLE, dark spectral caster robot wrapped in shadow veils, violet glowing runes floating around it$AURA$TT" 512 512 929
gen u_sporecaster "$UNITSTYLE, fat floating spore sac creature, pulsing fungal bulb body dripping glowing green spores$SKARN$TT" 768 512 930
gen u_corroder  "$UNITSTYLE, hunched flying corrosion beast, dripping acid sacs, membrane wings, hissing maw$SKARN$TT" 768 512 931

# ---------------- STRUCTURES (race-specific art baked) ----------------
for f in "$TERRAN|steel industrial base plate" "$SKARN|organic pulsing flesh base embedding" "$AURA|glowing rune-etched golden base ring"; do :; done
B_TERRAN="faction palette: gunmetal steel domes and panels, cyan strip lights, industrial girders, antenna arrays, on dark rocky foundation$TT"
B_SKARN="faction palette: living chitinous hive architecture, brown-black organic mounds, acid-green glowing sacs and spires, embedded in blighted soil$TT"
B_AURA="faction palette: soaring platinum obelisks and golden hard-light rings, azure energy conduits, elegant futuristic geometry on rune circle foundation$TT"

gen s_commandCenter   "RTS base headquarters building, wide command dome, landing pad and communication towers, from slightly above $B_TERRAN" 768 512 940
gen s_supplyDepot    "RTS supply depot, cluster of stacked cargo containers with gantry arm, from slightly above $B_TERRAN" 512 512 941
gen s_refinery       "RTS mineral refinery, industrial processing plant with conveyor and smelter glow, from slightly above $B_TERRAN" 768 512 942
gen s_barracks       "RTS infantry barracks, fortified bunker complex with armory dome and flag pole, from slightly above $B_TERRAN" 768 512 943
gen s_factory        "RTS vehicle factory, huge industrial hangar with gantry cranes and smokestacks, from slightly above $B_TERRAN" 768 512 944
gen s_machineShop    "RTS machine shop, small workshop with open bay and robotic arm, from slightly above $B_TERRAN" 512 512 945
gen s_starport       "RTS airfield starport, long hangar runway with parked fighter silhouette and control tower, from slightly above $B_TERRAN" 768 512 946
gen s_controlTower   "RTS air control tower, tall lattice tower with radar dome, from slightly above $B_TERRAN" 512 512 947
gen s_academy        "RTS training academy, drill hall with obstacle course towers, from slightly above $B_TERRAN" 512 512 948
gen s_missileTurret  "RTS anti-air missile turret, rotating launcher rack on armored pedestal, from slightly above $B_TERRAN" 512 512 949
gen s_engineeringBay "RTS engineering bay, workshop building with power conduits, from slightly above $B_TERRAN" 512 512 950
gen s_scienceFacility "RTS science laboratory facility, satellite dish campus with clean dome, from slightly above $B_TERRAN" 768 512 951
gen s_bunker         "RTS defensive bunker, low armored pillbox with gun slit and sandbag perimeter, from slightly above $B_TERRAN" 512 512 952
gen s_broodNest      "RTS alien hatchery, massive organic brood sac nest with dripping membranes and tunnels, from slightly above $B_SKARN" 768 512 953
gen s_geneForge      "RTS alien mutation lab, organic spire with glowing gene vats embedded in flesh, from slightly above $B_SKARN" 512 512 954
gen s_blightNode     "RTS toxin node, small pulsing venom sac venting green gas, from slightly above $B_SKARN" 512 512 955
gen s_clawPit        "RTS alien beast den, sunken arena pit with sharpened claw walls, from slightly above $B_SKARN" 512 512 956
gen s_spineWarren    "RTS alien defense warren, burrow mound bristling with bone spines, from slightly above $B_SKARN" 512 512 957
gen s_aerie          "RTS flying beast roost, high spire nest with wings carved into it, from slightly above $B_SKARN" 512 512 958
gen s_hive           "RTS great alien hive heart, colossal central organ tower with pulsing sacs and root tunnels, from slightly above $B_SKARN" 768 512 959
gen s_deepWarren     "RTS deep tunnel entrance, yawning maw hole with chitinous jaws in the earth, from slightly above $B_SKARN" 768 512 960
gen s_tremorCavern   "RTS seismic beast cavern, cracked ground crater with clawed cavern mouth, from slightly above $B_SKARN" 512 512 961
gen s_stingerColony  "RTS small flying stinger brood cluster on rock, from slightly above $B_SKARN" 512 512 962
gen s_gasSiphon      "RTS gas extraction organ, organic pump structure siphoning glowing green gas geyser, from slightly above $B_SKARN" 768 512 963
gen s_aegis          "RTS alien great fortress, layered chitinous bastion with spire turrets, from slightly above $B_SKARN" 768 512 964
gen s_essenceTap     "RTS alien gas spire, tall organic tower drinking from a glowing geyser, from slightly above $B_SKARN" 768 512 965
gen s_conduit        "RTS energy relay, small platinum pylon channeling golden light beam, from slightly above $B_AURA" 512 512 966
gen s_portal         "RTS teleportation gateway, towering golden ring portal with azure energy vortex, from slightly above $B_AURA" 512 512 967
gen s_fabricator     "RTS robotic fabrication hall, platinum dome with hard-light assembly arms, from slightly above $B_AURA" 768 512 968
gen s_synapseCore    "RTS psychic core, floating crystal brain chamber in golden containment rings, from slightly above $B_AURA" 512 512 969
gen s_runeworks      "RTS rune forge workshop, glowing engraved rune slabs around an anvil of light, from slightly above $B_AURA" 512 512 970
gen s_psiVault       "RTS psionic vault, sealed obsidian chamber with floating violet runes, from slightly above $B_AURA" 512 512 971
gen s_convocation    "RTS gatherer hall, open colonnade of platinum arches around glowing well, from slightly above $B_AURA" 768 512 972
gen s_skyPortal      "RTS sky gate, colossal floating launch ring beaming ships into the sky, from slightly above $B_AURA" 768 512 973
gen s_skyAnchor      "RTS sky anchor spire, tall stabilizing obelisk tethering floating platform, from slightly above $B_AURA" 512 512 974
gen s_lanceTurret    "RTS energy lance turret, rotating golden emitter cannon on pedestal, from slightly above $B_AURA" 512 512 975
gen s_forge          "RTS light forge, compact foundry with hard-light crucible, from slightly above $B_AURA" 512 512 976
gen fx_explosion    "massive fiery explosion, orange white fireball with dark smoke ring and flying debris, game effect sprite, flat solid pure magenta background #FF00FF, no ground, no text, original IP" 512 512 980
gen fx_inferno      "raging inferno fire column, intense orange flames with embers and black smoke, game effect sprite, flat solid pure magenta background #FF00FF, no ground, no text, original IP" 512 512 981
gen fx_rubble       "burning building rubble pile, twisted blackened beams and broken concrete with small embers and smoke wisps, game debris sprite top-down three-quarter view, flat solid pure magenta background #FF00FF, no text, original IP" 768 512 982
gen fx_crater       "fresh impact crater in dark rocky ground, glowing hot rim cracks, scorched earth ring top-down view, game effect sprite, flat solid pure magenta background #FF00FF, no text, original IP" 512 512 983
gen fx_smoke        "thick dark smoke plume column, billowing grey-black smoke puffs, game effect sprite, flat solid pure magenta background #FF00FF, no ground, no text, original IP" 512 512 984
gen s_refinery_geyser "RTS mineral refinery built over a glowing blue gas geyser, industrial plant with transparent dome showing swirling cyan gas, floor opening beneath, from slightly above $B_TERRAN" 768 512 977
gen s_gasSiphon_geyser "RTS alien gas extraction organ siphoning a glowing green geyser, organic pumping maw wrapped around the vent, from slightly above $B_SKARN" 768 512 978
gen s_essenceTap_geyser "RTS golden crystal gas tap tower on a glowing azure geyser, elegant platinum structure drinking the energy column, from slightly above $B_AURA" 768 512 979
echo UNITSTRUCTDONE
