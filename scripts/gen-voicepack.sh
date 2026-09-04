#!/usr/bin/env bash
# Generate per-race unit voice packs with macOS `say` (free, local, offline).
# Each line -> assets/vo/<race>/<action>_<n>.m4a (compact, game-ready).
# Re-runnable: overwrites cleanly. 1486ms per line typical; ~60 lines.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VO="$ROOT/assets/vo"
mkdir -p "$VO"

gen() { # voice rate pitch file text
  local voice="$1" rate="$2" pitch="$3" out="$4"; shift 4
  if [ -f "$out" ]; then return 0; fi
  say -v "$voice" -r "$rate" "$*" -o /tmp/_vo_$$.aiff 2>/dev/null || { rm -f /tmp/_vo_$$.aiff; return 0; }
  afconvert -f m4af -d aac /tmp/_vo_$$.aiff "$out" 2>/dev/null || mv /tmp/_vo_$$.aiff "$out"
  rm -f /tmp/_vo_$$.aiff
}

# ---- TERRAN: gruff marines, clipped. Albert / Fred / Junior / Rocko ----
T="$VO/terran"; mkdir -p "$T"
gen Albert 150 0.7 "$T/move_1.m4a" "On my way."
gen Albert 150 0.7 "$T/move_2.m4a" "Move out, move out!"
gen Fred 140 0.55 "$T/move_3.m4a" " copy that."
gen Junior 155 0.9 "$T/move_4.m4a" "Heading in."
gen Albert 160 0.75 "$T/attack_1.m4a" "Weapons free!"
gen Fred 150 0.5 "$T/attack_2.m4a" "Light 'em up!"
gen Albert 165 0.8 "$T/attack_3.m4a" "Open fire!"
gen Junior 150 0.95 "$T/attack_4.m4a" "Engaging target!"
gen Albert 140 0.65 "$T/ready_1.m4a" "Ready."
gen Fred 140 0.5 "$T/ready_2.m4a" "Sir, yes sir."
gen Junior 150 0.9 "$T/ready_3.m4a" "Awaiting orders."
gen Albert 135 0.6 "$T/select_1.m4a" "Go again."
gen Fred 130 0.5 "$T/select_2.m4a" " orders?"
gen Albert 150 0.7 "$T/build_1.m4a" "Structure online."
gen Fred 140 0.5 "$T/build_2.m4a" "Building complete."
gen Albert 150 0.75 "$T/trained_1.m4a" "New unit ready."

# ---- ZERG: alien, raspy, creepy. Grandpa + pitch-shifted via WebAudio at runtime ----
Z="$VO/zerg"; mkdir -p "$Z"
gen Grandpa 130 0.6 "$Z/move_1.m4a" "We move."
gen Bad 140 0.4 "$Z/move_2.m4a" "Hunting."
gen Grandpa 125 0.5 "$Z/move_3.m4a" "Obey."
gen Grandpa 145 0.35 "$Z/attack_1.m4a" "Kill them all."
gen Bad 150 0.4 "$Z/attack_2.m4a" "Slay!"
gen Grandpa 140 0.45 "$Z/attack_3.m4a" "For the swarm."
gen Bad 135 0.4 "$Z/ready_1.m4a" "Yes master."
gen Grandpa 130 0.5 "$Z/ready_2.m4a" "Hatching."
gen Bad 145 0.35 "$Z/select_1.m4a" "The swarm hears."
gen Grandpa 130 0.45 "$Z/build_1.m4a" "Creep spreads."

# ---- PROTOSS: calm, resonant, noble. Kyan/Kathy/O trinoid-> use Kathy+Whisper ----
P="$VO/protoss"; mkdir -p "$P"
gen Kathy 135 1.15 "$P/move_1.m4a" "It is done."
gen Kathy 130 1.2 "$P/move_2.m4a" "Advancing."
gen Whisper 125 1.3 "$P/move_3.m4a" "En taro Adun."
gen Kathy 145 1.1 "$P/attack_1.m4a" "Purge the enemy."
gen Whisper 140 1.25 "$P/attack_2.m4a" "For the Daelaam."
gen Kathy 150 1.15 "$P/attack_3.m4a" "My life for Aiur."
gen Kathy 130 1.2 "$P/ready_1.m4a" "Ready."
gen Whisper 125 1.35 "$P/ready_2.m4a" "Orders, templar?"
gen Kathy 135 1.1 "$P/select_1.m4a" "Speak."
gen Whisper 130 1.3 "$P/build_1.m4a" "The crystals hum."
gen Kathy 140 1.15 "$P/boss_1.m4a" "You face the judgment of Aiur."
gen Whisper 135 1.4 "$P/boss_2.m4a" "Your destruction is calculated."
say -v '?' | grep -qi "Trinoids" && gen Trinoids 120 1.5 "$P/boss_3.m4a" "I am the executor." || true
echo "voice pack counts:"; for d in terran zerg protoss; do echo "  $d: $(ls "$VO/$d" | wc -l | tr -d ' ')"; done
